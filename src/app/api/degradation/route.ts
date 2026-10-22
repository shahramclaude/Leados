import { getUserFacingDegradation } from "@/lib/degradation";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getUserFacingDegradation();
  const worst = status.some((s) => s.status === "outage")
    ? "outage"
    : status.some((s) => s.status === "degraded")
      ? "degraded"
      : "operational";
  return Response.json({ overall: worst, dependencies: status });
}
