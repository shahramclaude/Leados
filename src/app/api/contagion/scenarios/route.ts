import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contagionScenarios } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const segmentId = searchParams.get("segmentId");

  const rows = await db
    .select()
    .from(contagionScenarios)
    .where(segmentId ? eq(contagionScenarios.segmentId, Number(segmentId)) : undefined);

  return Response.json({ scenarios: rows });
}
