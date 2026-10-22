import { db } from "@/db";
import { automationRuns, decisions } from "@/db/schema";
import { requireAuth } from "@/lib/api/auth";
import { parsePageParams, toPagedResult } from "@/lib/api/pagination";
import { errorResponse, NotFoundError } from "@/lib/api/respond";
import { createAutomationRunSchema } from "@/lib/api/schemas";
import { createPrng } from "@/lib/prng";
import { runMonteCarlo, samplePertDuration } from "@/lib/domain/montecarlo";
import { and, count, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    const url = new URL(request.url);
    const page = parsePageParams(url);

    const [rows, totalRow] = await Promise.all([
      db
        .select()
        .from(automationRuns)
        .where(eq(automationRuns.tenantId, auth.tenantId))
        .orderBy(automationRuns.id)
        .limit(page.pageSize)
        .offset(page.offset),
      db
        .select({ value: count() })
        .from(automationRuns)
        .where(eq(automationRuns.tenantId, auth.tenantId)),
    ]);

    return Response.json(toPagedResult(rows, totalRow[0]?.value ?? 0, page));
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Creates and synchronously executes an automation run: a deterministic
 * Monte Carlo re-simulation of the linked decision's PERT estimate, seeded
 * by `decisionId` so results are reproducible for the same decision (the
 * MC-reproducibility property exercised in src/lib/domain/montecarlo.test.ts
 * applies identically here).
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request);
    const body = createAutomationRunSchema.parse(await request.json());

    const decisionRows = await db
      .select()
      .from(decisions)
      .where(
        and(
          eq(decisions.id, body.decisionId),
          eq(decisions.tenantId, auth.tenantId),
        ),
      )
      .limit(1);
    const decision = decisionRows[0];
    if (!decision) {
      throw new NotFoundError(
        `Decision ${body.decisionId} not found for this tenant`,
      );
    }

    const prng = createPrng(body.decisionId);
    const result = runMonteCarlo(
      1000,
      (p) =>
        samplePertDuration(
          p,
          decision.optimisticEstimate,
          decision.likelyEstimate,
          decision.pessimisticEstimate,
        ),
      prng,
    );

    const [created] = await db
      .insert(automationRuns)
      .values({
        tenantId: auth.tenantId,
        decisionId: body.decisionId,
        status: "succeeded",
        startedAt: new Date(),
        finishedAt: new Date(),
        output: {
          trials: result.trials,
          mean: result.mean,
          stdDev: result.stdDev,
          p50: result.percentile(50),
          p90: result.percentile(90),
        },
      })
      .returning();

    return Response.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
