import { z } from "zod";
import { getMaintenanceState, setMaintenanceMode } from "@/lib/ops/maintenance";
import { appendAudit } from "@/lib/ops/auditChain";
import { withApiHandler } from "@/lib/obs/apiHandler";
import { requireAdmin } from "@/lib/ops/adminAuth";

export const dynamic = "force-dynamic";

export const GET = withApiHandler({ routeFamily: "admin_maintenance", allowDuringMaintenance: true }, async () => {
  const state = await getMaintenanceState();
  return Response.json(state);
});

const BodySchema = z.object({ enabled: z.boolean(), reason: z.string().optional() });

export const POST = withApiHandler({ routeFamily: "admin_maintenance", allowDuringMaintenance: true }, async (req) => {
  requireAdmin(req);
  const body = BodySchema.parse(await req.json());
  await setMaintenanceMode(body.enabled, body.reason, "admin");
  await appendAudit("admin", body.enabled ? "maintenance.enable" : "maintenance.disable", "maintenance_state", { reason: body.reason });
  const state = await getMaintenanceState();
  return Response.json(state);
});
