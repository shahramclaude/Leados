import { computeFailureDomainCoverage } from "@/lib/resilience";

export const dynamic = "force-dynamic";

export async function GET() {
  const coverage = await computeFailureDomainCoverage();
  return Response.json({ coverage });
}
