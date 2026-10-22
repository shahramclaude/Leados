import { loadObligations } from "@/lib/esgData";
import { projectObligations } from "@/lib/obligationTracker";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const obligations = await loadObligations();
    return Response.json({ ok: true, data: projectObligations(obligations) });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "unknown error" }, { status: 500 });
  }
}
