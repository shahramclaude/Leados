import { NextRequest } from "next/server";
import { runBacktestSchema } from "@/lib/validation";
import { runBacktest } from "@/lib/worldModel";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = runBacktestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const row = await runBacktest(parsed.data);
    if (row === null) {
      return Response.json({ error: "no_ground_truth_yet" }, { status: 422 });
    }
    return Response.json({ backtest: row }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "backtest_failed";
    return Response.json({ error: message }, { status: 422 });
  }
}
