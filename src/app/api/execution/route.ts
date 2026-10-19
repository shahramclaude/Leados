import { db } from "@/db";
import * as schema from "@/db/schema";
import { ensureBaselineData } from "@/lib/seed";
import { withErrorHandling, jsonOk } from "@/lib/api";
import { buildCriticalPath } from "@/lib/strategicIntel";
import { computeDeliveryConfidence } from "@/lib/executionIntel";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling("execution", async (_req, requestId) => {
  await ensureBaselineData(db);

  const projectRows = await db.select().from(schema.projects);

  const criticalPath = buildCriticalPath(
    projectRows.map((p) => ({ id: p.id, name: p.name, durationDays: p.durationDays, dependencies: p.dependencies })),
  );

  const confidences = projectRows.map((p) => {
    const computedConfidence = computeDeliveryConfidence({
      scopeCreepScore: 1 - p.deliveryConfidence,
      teamAttritionScore: 0.2,
      dependencyRiskScore: p.dependencies.length > 0 ? 0.3 : 0.1,
      blockerCount: 0,
      velocityTrend: p.deliveryConfidence - 0.7,
    });
    return { projectId: p.id, name: p.name, computedConfidence };
  });

  return jsonOk({ projects: projectRows, criticalPath, confidences }, requestId);
});
