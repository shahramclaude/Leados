// Post-Mortem Bridge: records realized outcomes against a simulation's
// prediction, computes variance, and feeds the recalibration loop (Part 39
// counterfactual-estimation lineage) — the twin learns from each reorg.

import { db } from "@/db";
import { postChangeTracking, simulationRuns, structuralMoves, twinModelParameters } from "@/db/schema";
import { computeVariance, recalibrateParams } from "@/lib/org-design/recalibration";
import type { DeliveryImpact, StructuralMoveType } from "@/lib/org-design/types";
import { DEFAULT_TWIN_PARAMS, type TwinParams } from "@/lib/org-design/twinEngine";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(postChangeTracking).orderBy(desc(postChangeTracking.createdAt));
  return Response.json({ rows });
}

export async function POST(req: Request) {
  const body = await req.json();
  const simulationRunId = Number(body.simulationRunId);
  const realizedCapacityChangePct = Number(body.realizedCapacityChangePct);
  const realizedCycleTimeChangeDays = Number(body.realizedCycleTimeChangeDays);

  if (!Number.isFinite(simulationRunId) || !Number.isFinite(realizedCapacityChangePct) || !Number.isFinite(realizedCycleTimeChangeDays)) {
    return Response.json({ ok: false, error: "simulationRunId, realizedCapacityChangePct, realizedCycleTimeChangeDays are required" }, { status: 400 });
  }

  const [run] = await db.select().from(simulationRuns).where(eq(simulationRuns.id, simulationRunId));
  if (!run) return Response.json({ ok: false, error: "Simulation run not found" }, { status: 404 });
  if (!run.moveId) return Response.json({ ok: false, error: "Only structural-move simulations can be tracked today" }, { status: 400 });

  const [move] = await db.select().from(structuralMoves).where(eq(structuralMoves.id, run.moveId));
  if (!move) return Response.json({ ok: false, error: "Underlying structural move not found" }, { status: 404 });

  const [latestParamsRow] = await db.select().from(twinModelParameters).orderBy(desc(twinModelParameters.version)).limit(1);
  const currentParams: TwinParams = (latestParamsRow?.params as TwinParams) ?? DEFAULT_TWIN_PARAMS;
  const currentVersion = latestParamsRow?.version ?? 0;

  const predicted = run.deliveryImpact as DeliveryImpact;
  const outcome = {
    type: move.type as StructuralMoveType,
    predictedCapacityChangePct: predicted.capacityChangePct.value,
    realizedCapacityChangePct,
    predictedCycleTimeChangeDays: predicted.cycleTimeChangeDays.value,
    realizedCycleTimeChangeDays,
  };

  const variance = computeVariance(outcome, currentParams);
  const nextParams = recalibrateParams(currentParams, outcome);
  const nextVersion = currentVersion + 1;

  await db.insert(twinModelParameters).values({
    version: nextVersion,
    params: nextParams,
    errorMargins: {
      capacityChangePct: nextParams.capacityErrorFraction,
      cycleTimeChangeDays: nextParams.cycleTimeErrorFraction,
      cohesion: nextParams.cohesionErrorMargin,
    },
    notes: `Recalibrated from simulation run #${simulationRunId} (${move.type}) — realized vs predicted variance applied with damping.`,
  });

  const [tracked] = await db
    .insert(postChangeTracking)
    .values({
      simulationRunId,
      predicted: { capacityChangePct: predicted.capacityChangePct.value, cycleTimeChangeDays: predicted.cycleTimeChangeDays.value },
      realized: { capacityChangePct: realizedCapacityChangePct, cycleTimeChangeDays: realizedCycleTimeChangeDays },
      variance,
      recalibrationApplied: true,
      newParamsVersion: nextVersion,
    })
    .returning();

  return Response.json({
    ok: true,
    tracked,
    variance,
    before: { version: currentVersion, coefficient: currentParams.capacityCoefficients[move.type as StructuralMoveType] },
    after: { version: nextVersion, coefficient: nextParams.capacityCoefficients[move.type as StructuralMoveType] },
  });
}
