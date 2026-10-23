import { processSpecs } from "@/db/schema";
import { updateRow, badRequest, ok } from "@/lib/leados/crud";
import { checkProcessSpec } from "@/lib/leados/formal";
import { db } from "@/db";
import { eq } from "drizzle-orm";

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await context.params;
  const id = Number(idParam);
  if (!id) return badRequest("invalid id");
  const [existing] = await db.select().from(processSpecs).where(eq(processSpecs.id, id));
  if (!existing) return badRequest("spec not found");

  const result = checkProcessSpec({
    statesList: existing.statesList,
    transitions: existing.transitions,
    invariants: existing.invariants,
    maxBoundedStates: existing.maxBoundedStates,
  });

  const row = await updateRow(processSpecs, processSpecs.id, id, {
    verdict: result.verdict,
    statesExplored: result.statesExplored,
    counterexamples: result.counterexample ? result.counterexample.join(" → ") : "",
    lastCheckedAt: new Date(),
  });
  return ok(row);
}
