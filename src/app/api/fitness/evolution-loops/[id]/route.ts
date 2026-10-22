import { db } from "@/db";
import { evolutionLoops } from "@/db/schema";
import {
  EvolutionLoopTransitionError,
  validateTransition,
  type EvolutionStage,
} from "@/lib/fitness/evolutionLoop";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [loop] = await db.select().from(evolutionLoops).where(eq(evolutionLoops.id, Number(id)));
  if (!loop) return Response.json({ ok: false, error: "Loop not found." }, { status: 404 });
  return Response.json({ ok: true, loop });
}

type Action =
  | { action: "twin_predict"; twinPredictedDelta: number; twinConfidence: number }
  | { action: "submit_decision"; decisionId: string }
  | { action: "approve"; approvedBy: string }
  | { action: "reject"; rejectedReason: string }
  | { action: "execute"; executionRef: string }
  | { action: "measure"; actualDelta: number; counterfactualDelta: number; counterfactualNote: string }
  | { action: "update_belief"; beliefUpdateNote: string };

const ACTION_TO_STAGE: Record<Action["action"], EvolutionStage> = {
  twin_predict: "twin_predicted",
  submit_decision: "decision_pending",
  approve: "decision_approved",
  reject: "decision_rejected",
  execute: "executing",
  measure: "measured",
  update_belief: "belief_updated",
};

/**
 * PATCH /api/fitness/evolution-loops/:id — the ONLY way an evolution loop
 * advances. Every transition is validated against the gated stage machine;
 * "approve" and "execute" are hard-blocked without a named human approver on
 * a T3-tier loop. This endpoint is the structural enforcement of "every arrow
 * is a human-approved decision."
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const loopId = Number(id);
    const body = (await req.json()) as Action;

    const [loop] = await db.select().from(evolutionLoops).where(eq(evolutionLoops.id, loopId));
    if (!loop) return Response.json({ ok: false, error: "Loop not found." }, { status: 404 });

    const nextStage = ACTION_TO_STAGE[body.action];
    if (!nextStage) {
      return Response.json({ ok: false, error: `Unknown action: ${(body as { action?: string }).action}` }, { status: 400 });
    }

    try {
      validateTransition(
        {
          stage: loop.stage as EvolutionStage,
          decisionTier: loop.decisionTier as "T1" | "T2" | "T3",
          approvedBy: loop.approvedBy,
          approvedAt: loop.approvedAt ? loop.approvedAt.toISOString() : null,
        },
        nextStage,
        { approvedBy: body.action === "approve" ? body.approvedBy : undefined },
      );
    } catch (e) {
      if (e instanceof EvolutionLoopTransitionError) {
        return Response.json({ ok: false, error: e.message }, { status: 409 });
      }
      throw e;
    }

    const update: Record<string, unknown> = { stage: nextStage, updatedAt: new Date() };

    switch (body.action) {
      case "twin_predict":
        update.twinPredictedDelta = body.twinPredictedDelta.toString();
        update.twinConfidence = body.twinConfidence.toString();
        break;
      case "submit_decision":
        update.decisionId = body.decisionId;
        break;
      case "approve":
        update.approvedBy = body.approvedBy;
        update.approvedAt = new Date();
        break;
      case "reject":
        update.rejectedReason = body.rejectedReason;
        break;
      case "execute":
        update.executionRef = body.executionRef;
        update.executedAt = new Date();
        break;
      case "measure":
        update.actualDelta = body.actualDelta.toString();
        update.counterfactualDelta = body.counterfactualDelta.toString();
        update.counterfactualNote = body.counterfactualNote;
        update.measuredAt = new Date();
        break;
      case "update_belief":
        update.beliefUpdateNote = body.beliefUpdateNote;
        break;
    }

    const [updated] = await db.update(evolutionLoops).set(update).where(eq(evolutionLoops.id, loopId)).returning();
    return Response.json({ ok: true, loop: updated });
  } catch (err) {
    console.error(err);
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "transition failed" }, { status: 500 });
  }
}
