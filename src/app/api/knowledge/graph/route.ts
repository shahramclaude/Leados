import { NextResponse } from "next/server";
import { db } from "@/db";
import { getGraphSubgraph } from "@/lib/knowledgeGraph";

export const dynamic = "force-dynamic";

// GET /api/knowledge/graph?days=90 → GraphSubgraph (recent N days, capped at
// 200 nodes + 500 edges).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = Number(searchParams.get("days") ?? "90") || 90;
  try {
    const subgraph = await getGraphSubgraph(db, { sinceDays: days, nodeLimit: 200, edgeLimit: 500 });
    return NextResponse.json(subgraph);
  } catch (error) {
    console.error("GET /api/knowledge/graph failed", error);
    return NextResponse.json({ error: "Failed to load knowledge graph" }, { status: 500 });
  }
}
