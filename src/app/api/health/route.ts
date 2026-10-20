import { getCompositeHealth, httpStatusForComposite } from "@/lib/health/composite";
import { withObservability } from "@/lib/observability/apiHandler";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Composite health endpoint. Consolidates every subsystem dependency check
// this build actually has into one response instead of several
// single-purpose endpoints (see docs/health-model note in README.md for why
// there is one endpoint instead of the five speculative ones referenced in
// the upstream brief — they checked subsystems, brain/decision/metric/rule
// engines, that do not exist as working code in this tree).
export const GET = withObservability("GET /api/health", async () => {
  const health = await getCompositeHealth();
  return NextResponse.json(health, { status: httpStatusForComposite(health.status) });
});
