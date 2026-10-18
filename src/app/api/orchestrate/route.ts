import { NextResponse } from "next/server";
import { getLatestOrchestratorResult, runOrchestrator } from "@/lib/orchestrator";

export const dynamic = "force-dynamic";

// GET: cheap read of the latest persisted orchestrator state. Used on
// mount and whenever the SSE connection (re)establishes.
export async function GET() {
  try {
    const result = await getLatestOrchestratorResult();
    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/orchestrate failed", error);
    return NextResponse.json({ error: "Failed to load orchestrator result" }, { status: 500 });
  }
}

// POST: triggers a full fresh orchestrator run across every rule.
export async function POST() {
  try {
    const result = await runOrchestrator();
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/orchestrate failed", error);
    return NextResponse.json({ error: "Failed to run orchestrator" }, { status: 500 });
  }
}
