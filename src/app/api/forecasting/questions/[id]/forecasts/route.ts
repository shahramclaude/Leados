import { ensureSeedData, submitForecast } from "@/lib/sensing/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  await ensureSeedData();
  const { id } = await context.params;
  const questionId = Number(id);
  if (!Number.isFinite(questionId)) {
    return Response.json({ error: "invalid question id" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const forecaster = typeof body.forecaster === "string" ? body.forecaster.trim() : "";
  const probability = typeof body.probability === "number" ? body.probability : NaN;
  if (!forecaster || Number.isNaN(probability) || probability < 0 || probability > 1) {
    return Response.json({ error: "forecaster and a probability in [0,1] are required" }, { status: 400 });
  }
  const row = await submitForecast(questionId, forecaster, probability, Boolean(body.isModel));
  return Response.json({ forecast: row }, { status: 201 });
}
