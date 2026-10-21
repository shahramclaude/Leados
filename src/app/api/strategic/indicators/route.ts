import { evaluateIndicators } from "@/lib/strategicIntelligence";

export const dynamic = "force-dynamic";

export async function GET() {
  const evals = await evaluateIndicators();
  return Response.json({ indicators: evals });
}
