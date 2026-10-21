import { getDashboardSummary } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const start = performance.now();
  const summary = await getDashboardSummary();
  const durationMs = performance.now() - start;
  return Response.json({ ...summary, _timingMs: Math.round(durationMs) });
}
