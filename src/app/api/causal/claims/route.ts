import { listClaims } from "@/lib/causal/store";
import { claimFreshness, daysUntil } from "@/lib/causal/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const claims = await listClaims();
    const enriched = claims.map((c) => ({
      ...c,
      freshness: claimFreshness(c),
      daysUntilRevalidation: daysUntil(c.revalidateBy),
    }));
    return Response.json({ ok: true, claims: enriched });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err), claims: [] },
      { status: 500 }
    );
  }
}
