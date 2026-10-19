import { db } from "@/db";
import * as schema from "@/db/schema";
import { ensureBaselineData } from "@/lib/seed";
import { withErrorHandling, jsonOk, validateBody, isValidationFailure, jsonError } from "@/lib/api";
import { eq, asc } from "drizzle-orm";
import { calibrateRule } from "@/lib/agentCycle";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling("hypothesis", async (_req, requestId) => {
  await ensureBaselineData(db);
  const hypotheses = await db.select().from(schema.hypotheses).orderBy(asc(schema.hypotheses.resolveBy));
  return jsonOk({ hypotheses }, requestId);
});

type CreateHypothesisBody = {
  entity: string;
  claim: string;
  resolveBy: string;
  confidence?: number;
  ruleId?: number;
};

export const POST = withErrorHandling("hypothesis", async (req, requestId) => {
  const body = await req.json().catch(() => null);
  const validated = validateBody<CreateHypothesisBody>(body, ["entity", "claim", "resolveBy"]);
  if (isValidationFailure(validated)) {
    return jsonError(`Missing required fields: ${validated.missing.join(", ")}`, "VALIDATION_ERROR", 400, requestId);
  }

  const resolveByDate = new Date(validated.resolveBy);
  if (Number.isNaN(resolveByDate.getTime())) {
    return jsonError("resolveBy must be a valid date", "VALIDATION_ERROR", 400, requestId);
  }

  const [row] = await db
    .insert(schema.hypotheses)
    .values({
      entity: validated.entity,
      claim: validated.claim,
      resolveBy: resolveByDate,
      confidence: validated.confidence ?? 0.5,
      ruleId: validated.ruleId ?? null,
      status: "open",
    })
    .returning();

  return jsonOk({ hypothesis: row }, requestId, 201);
});

type PatchHypothesisBody = { id: number; status: "confirmed" | "refuted" | "open" };

export const PATCH = withErrorHandling("hypothesis", async (req, requestId) => {
  const body = await req.json().catch(() => null);
  const validated = validateBody<PatchHypothesisBody>(body, ["id", "status"]);
  if (isValidationFailure(validated)) {
    return jsonError(`Missing required fields: ${validated.missing.join(", ")}`, "VALIDATION_ERROR", 400, requestId);
  }

  const [existing] = await db.select().from(schema.hypotheses).where(eq(schema.hypotheses.id, validated.id)).limit(1);
  if (!existing) {
    return jsonError(`Hypothesis ${validated.id} not found`, "NOT_FOUND", 404, requestId);
  }

  await db.update(schema.hypotheses).set({ status: validated.status }).where(eq(schema.hypotheses.id, validated.id));

  if (existing.ruleId != null && (validated.status === "confirmed" || validated.status === "refuted")) {
    await calibrateRule(db, existing.ruleId, validated.status);
  }

  return jsonOk({ ok: true }, requestId);
});
