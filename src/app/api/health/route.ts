// Composite health: one endpoint, per-subsystem status, degraded states a
// human can act on. Replaces the five-endpoint model the task brief
// assumes with a single coherent one (see
// docs/adr/0003-part18-scope-given-upstream-inconsistency.md).
import { getCompositeHealth, statusToHttpCode } from "@/lib/ops/health/composite";
import { withApiHandler } from "@/lib/obs/apiHandler";

export const dynamic = "force-dynamic";

export const GET = withApiHandler({ routeFamily: "health", allowDuringMaintenance: true }, async () => {
  const health = await getCompositeHealth();
  return Response.json(health, { status: statusToHttpCode(health.status) });
});
