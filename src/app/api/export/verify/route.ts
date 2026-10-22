import { db } from "@/db";
import { exportManifests } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyExportRoundTrip } from "@/lib/export";
import { emitEvent } from "@/lib/dbEvents";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { manifestId?: string; csvText?: string } | null;
  if (!body?.manifestId || typeof body.csvText !== "string") {
    return Response.json({ error: "manifestId and csvText are required." }, { status: 400 });
  }
  const [manifest] = await db.select().from(exportManifests).where(eq(exportManifests.id, body.manifestId));
  if (!manifest) return Response.json({ error: "Manifest not found." }, { status: 404 });

  const result = verifyExportRoundTrip(body.csvText, manifest);
  await emitEvent("export.verified", { manifestId: body.manifestId, ok: result.ok });
  return Response.json({ manifest, result });
}
