import { getCachedDailyBuckets } from "@/lib/statsCache";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const days = Math.min(180, Math.max(1, Number(url.searchParams.get("days")) || 30));

  const started = performance.now();
  const { value, cache } = await getCachedDailyBuckets(days);
  const tookMs = performance.now() - started;

  return Response.json({ buckets: value, cache, tookMs: Math.round(tookMs * 100) / 100 });
}
