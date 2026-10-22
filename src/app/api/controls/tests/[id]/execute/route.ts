import { executeControlTest } from "@/lib/controls";

export const dynamic = "force-dynamic";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  let manualResult: "pass" | "fail" | undefined;
  let manualNote: string | undefined;
  let actor = "control-test-runner";
  try {
    const body = await req.json();
    if (body?.manualResult === "pass" || body?.manualResult === "fail") manualResult = body.manualResult;
    if (typeof body?.manualNote === "string") manualNote = body.manualNote;
    if (typeof body?.actor === "string") actor = body.actor;
  } catch {
    // automated test, no body required
  }

  try {
    const result = await executeControlTest({ controlTestId: Number(id), actor, manualResult, manualNote });
    return Response.json({ result });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "unknown error" }, { status: 400 });
  }
}
