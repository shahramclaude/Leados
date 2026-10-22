import { verifyAuditChain } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await verifyAuditChain();
  return Response.json(result);
}
