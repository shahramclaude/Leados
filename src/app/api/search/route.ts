import { search } from "@/lib/search";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (!q) return Response.json({ ok: true, query: "", confidence: 0, results: [] });
  const result = await search(q);
  return Response.json({ ok: true, ...result });
}
