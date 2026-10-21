import { forecastDelivery, deliveryConfidence } from "@/lib/delivery";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = Number(searchParams.get("projectId"));
  if (!projectId) return Response.json({ error: "projectId query param required" }, { status: 400 });
  const [forecast, confidence] = await Promise.all([forecastDelivery(projectId), deliveryConfidence(projectId)]);
  if (!forecast) return Response.json({ error: "project not found" }, { status: 404 });
  return Response.json({ forecast: forecast.forecast, confidence });
}
