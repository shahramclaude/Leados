import { NextRequest } from "next/server";
import { neighborExpansion } from "@/lib/knowledgeGraph";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const entityId = searchParams.get("entityId");
  const depth = Number(searchParams.get("depth") ?? "2");
  const direction = (searchParams.get("direction") ?? "out") as "out" | "in" | "both";
  const includeProposed = searchParams.get("includeProposed") === "true";
  if (!entityId) return Response.json({ ok: false, error: "entityId is required" }, { status: 400 });

  try {
    const nodes = await neighborExpansion(entityId, depth, direction, { includeProposed });
    return Response.json({ ok: true, entityId, depth, direction, nodes });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
