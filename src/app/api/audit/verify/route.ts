import { verifyChain } from "@/lib/ops/auditChain";
import { withApiHandler } from "@/lib/obs/apiHandler";

export const dynamic = "force-dynamic";

export const GET = withApiHandler({ routeFamily: "audit_verify" }, async () => {
  const result = await verifyChain();
  return Response.json(result, { status: result.ok ? 200 : 409 });
});
