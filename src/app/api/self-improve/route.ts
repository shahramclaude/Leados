import "@/lib/kernel/bootstrap";
import { listProposals, proposeChange, seedGoldenCasesIfEmpty } from "@/lib/kernel/selfImprove";
import type { Actor } from "@/lib/kernel/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ proposals: await listProposals() });
}

export async function POST(req: Request) {
  await seedGoldenCasesIfEmpty();
  const body = (await req.json().catch(() => ({}))) as {
    kind?: "rule" | "threshold" | "prompt";
    ruleKey?: string;
    title?: string;
    rationale?: string;
    before?: unknown;
    after?: unknown;
    proposedById?: string;
  };
  if (!body.kind || !body.ruleKey || !body.title || !body.rationale || body.before === undefined || body.after === undefined) {
    return Response.json({ error: "kind, ruleKey, title, rationale, before, after are required" }, { status: 400 });
  }
  const proposedBy: Actor = { kind: "agent", id: body.proposedById ?? "self-improve-agent" };
  const proposal = await proposeChange({
    kind: body.kind,
    ruleKey: body.ruleKey,
    title: body.title,
    rationale: body.rationale,
    before: body.before,
    after: body.after,
    proposedBy,
  });
  return Response.json({ proposal }, { status: 201 });
}
