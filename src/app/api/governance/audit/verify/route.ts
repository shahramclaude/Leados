import { verifyChain } from "@/lib/governance/auditChain";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await verifyChain();
  return Response.json({ ...result, ok: result.ok });
}
