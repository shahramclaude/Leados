import { generateFindings, persistFindings } from "@/lib/intelligence/intelligence";
import { INTERRUPT_OPT_IN, sampleAccounts } from "@/lib/intelligence/demoData";

export const dynamic = "force-dynamic";

export async function GET() {
  const findings = generateFindings(sampleAccounts(), INTERRUPT_OPT_IN);
  try {
    await persistFindings(findings);
  } catch {
    // Persistence is best-effort for this read endpoint; the computed
    // findings are still returned even if the DB write fails.
  }
  return Response.json({ findings });
}
