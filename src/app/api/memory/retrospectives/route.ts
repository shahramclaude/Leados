import { NextRequest } from "next/server";
import { listRetrospectives, scheduleRetrospective, runRetrospectiveSweep } from "@/lib/memory";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") as "pending" | "completed" | "skipped" | null;
  const due = searchParams.get("due") === "true";
  try {
    if (due) {
      const sweep = await runRetrospectiveSweep();
      return Response.json({ ok: true, due: sweep });
    }
    const rows = await listRetrospectives(status ?? undefined);
    return Response.json({ ok: true, retrospectives: rows });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const required = ["decisionEntityId", "situation", "decision", "expectation", "reviewAt"];
    for (const f of required) {
      if (!body[f]) return Response.json({ ok: false, error: `${f} is required` }, { status: 400 });
    }
    const retro = await scheduleRetrospective({
      decisionEntityId: body.decisionEntityId,
      situation: body.situation,
      decision: body.decision,
      expectation: body.expectation,
      reviewAt: new Date(body.reviewAt),
    });
    return Response.json({ ok: true, retrospective: retro }, { status: 201 });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
