import { search } from "@/lib/search";
import type { ChunkKind } from "@/lib/retrieval";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const limit = Number(searchParams.get("limit") ?? "12");
  const kindsParam = searchParams.get("kinds");
  const kinds = kindsParam ? (kindsParam.split(",").filter(Boolean) as ChunkKind[]) : undefined;
  if (!q) return Response.json({ ok: true, query: "", confidence: 0, facets: [], results: [] });
  const result = await search(q, limit, kinds);
  return Response.json({ ok: true, ...result });
}
