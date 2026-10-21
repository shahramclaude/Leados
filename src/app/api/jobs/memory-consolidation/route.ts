import { NextResponse } from "next/server";
import { invokeCapability } from "@/lib/kernel/capabilities";
import "@/lib/kernel/consolidation"; // ensures the "memory.consolidate" capability is registered
import { listAuditEvents } from "@/lib/kernel/events";

export const dynamic = "force-dynamic";

// GET -> recent consolidation audit trail. POST -> trigger a run now (kernel or human).
export async function GET() {
  const events = await listAuditEvents({ type: "capability.memory.consolidate.succeeded", limit: 20 });
  return NextResponse.json({ runs: events });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { triggeredBy?: "human" | "kernel"; name?: string };
  const actor = { kind: body.triggeredBy ?? ("human" as const), name: body.name ?? "manual-trigger" };
  try {
    const report = await invokeCapability("memory.consolidate", undefined, actor);
    return NextResponse.json({ ok: true, report });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
