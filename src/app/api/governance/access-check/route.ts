import { allCombinations } from "@/lib/governance/access";

export const dynamic = "force-dynamic";

// Exposes the full board-tier access-attempt matrix for inspection and for
// the verification script's green-matrix gate.
export async function GET() {
  return Response.json({ ok: true, matrix: allCombinations() });
}
