import { db } from "@/db";
import { disclosurePacks } from "@/db/schema";
import { buildDisclosurePreview } from "@/lib/esgSurfaces";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await db.select().from(disclosurePacks);
    const summaries = rows
      .map((r) => ({
        id: r.id,
        period: r.period,
        standard: r.standard,
        generatedAt: r.generatedAt.toISOString(),
        gapCount: Array.isArray(r.gaps) ? r.gaps.length : 0,
        manifestHash: r.manifestHash,
      }))
      .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
    return Response.json({ ok: true, data: summaries });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "unknown error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const period: string | undefined = body?.period;
    const pack = await buildDisclosurePreview(period);
    const id = `PACK-${pack.period}-${randomUUID().slice(0, 8)}`;
    await db.insert(disclosurePacks).values({
      id,
      period: pack.period,
      standard: pack.standard,
      figures: pack.figures,
      lineageManifest: pack.lineageManifest,
      gaps: pack.gaps,
      manifestHash: pack.lineageManifest.hash,
    });
    return Response.json({ ok: true, data: { id, ...pack } });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "unknown error" }, { status: 500 });
  }
}
