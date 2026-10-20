import { LEADOS_PEOPLE_SCM } from "@/lib/causal/domainModel";
import { loadModel } from "@/lib/causal/dag";

export const dynamic = "force-dynamic";

export async function GET() {
  // Re-validates acyclicity at request time too (not just at load time),
  // so a bad edit to the stored definition fails loudly instead of being
  // served silently.
  try {
    loadModel(LEADOS_PEOPLE_SCM);
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
  return Response.json({ ok: true, model: LEADOS_PEOPLE_SCM });
}
