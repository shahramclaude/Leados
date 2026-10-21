import "@/lib/kernel/bootstrap";
import { approveProposal, evaluateProposal, mergeProposal, SelfImproveCagingError } from "@/lib/kernel/selfImprove";
import type { Actor } from "@/lib/kernel/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await req.json().catch(() => ({}))) as {
    action?: "evaluate" | "approve" | "reject" | "merge";
    actorId?: string;
    actorKind?: "human" | "agent";
    note?: string;
  };
  const actor: Actor = { kind: body.actorKind ?? "human", id: body.actorId ?? "unknown" };

  try {
    if (body.action === "evaluate") {
      const proposal = await evaluateProposal(id, actor);
      return Response.json({ proposal });
    }
    if (body.action === "approve" || body.action === "reject") {
      const proposal = await approveProposal(id, body.action === "approve" ? "approved" : "rejected", actor, body.note);
      return Response.json({ proposal });
    }
    if (body.action === "merge") {
      const proposal = await mergeProposal(id, actor);
      return Response.json({ proposal });
    }
    return Response.json({ error: "action must be one of evaluate|approve|reject|merge" }, { status: 400 });
  } catch (err) {
    if (err instanceof SelfImproveCagingError) {
      return Response.json({ error: err.message }, { status: 403 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 400 });
  }
}
