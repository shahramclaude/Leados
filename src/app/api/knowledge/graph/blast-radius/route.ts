import { NextRequest } from "next/server";
import { blastRadius } from "@/lib/knowledgeGraph";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const entityId = searchParams.get("entityId");
  const depth = Number(searchParams.get("depth") ?? "3");
  if (!entityId) return Response.json({ ok: false, error: "entityId is required" }, { status: 400 });

  try {
    const result = await blastRadius(entityId, depth);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
