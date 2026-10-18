import { computeIntelligence } from "@/lib/intelligence";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await computeIntelligence();
  await logAudit("INTELLIGENCE_COMPUTED", `${data.findings.length} findings`);
  return Response.json(data);
}
