import { recordAppetiteObservation } from "@/lib/appetite";

export const dynamic = "force-dynamic";

export async function POST(req: Request, context: { params: Promise<{ metricId: string }> }) {
  const { metricId } = await context.params;
  const body = await req.json().catch(() => ({}));
  const value = Number(body?.value);
  if (!Number.isFinite(value)) {
    return Response.json({ error: "numeric 'value' is required" }, { status: 400 });
  }
  const result = await recordAppetiteObservation(Number(metricId), value, body?.actor ?? "api");
  return Response.json(result);
}
