import { getSaturationAlerts } from "@/lib/change/dashboard";
import { DEFAULT_SATURATION_THRESHOLD } from "@/lib/change/changeLoad";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const thresholdParam = url.searchParams.get("threshold");
  const threshold = thresholdParam ? Number(thresholdParam) : DEFAULT_SATURATION_THRESHOLD;
  const findings = await getSaturationAlerts(new Date(), Number.isFinite(threshold) ? threshold : DEFAULT_SATURATION_THRESHOLD);
  return Response.json({ ok: true, threshold, findings });
}
