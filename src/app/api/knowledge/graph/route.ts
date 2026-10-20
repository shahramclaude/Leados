import { NextResponse } from "next/server";
import { getBlastRadius, getNeighbors, getOrphans, getShortestPath } from "@/lib/knowledgeGraph";

export const dynamic = "force-dynamic";

// GET /api/knowledge/graph?mode=neighbors&key=project:x&depth=2
// GET /api/knowledge/graph?mode=path&from=decision:x&to=metric:y
// GET /api/knowledge/graph?mode=blast&key=decision:x&depth=3
// GET /api/knowledge/graph?mode=orphans
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") ?? "neighbors";
  const depth = Number(searchParams.get("depth") ?? "2");

  if (mode === "neighbors") {
    const key = searchParams.get("key");
    if (!key) return NextResponse.json({ error: "key is required" }, { status: 400 });
    const result = await getNeighbors(key, depth);
    return NextResponse.json(result);
  }

  if (mode === "path") {
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (!from || !to) return NextResponse.json({ error: "from and to are required" }, { status: 400 });
    const result = await getShortestPath(from, to);
    if (!result) return NextResponse.json({ found: false });
    return NextResponse.json({ found: true, ...result });
  }

  if (mode === "blast") {
    const key = searchParams.get("key");
    if (!key) return NextResponse.json({ error: "key is required" }, { status: 400 });
    const result = await getBlastRadius(key, depth);
    return NextResponse.json({ entries: result });
  }

  if (mode === "orphans") {
    const result = await getOrphans();
    return NextResponse.json({ orphans: result });
  }

  return NextResponse.json({ error: `unknown mode "${mode}"` }, { status: 400 });
}
