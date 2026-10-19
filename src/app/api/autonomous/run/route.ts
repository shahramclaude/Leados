import { db } from "@/db";
import { hypotheses as hypothesesTable, notifications as notificationsTable } from "@/db/schema";
import { fetchOrchestrationDataset } from "@/lib/dataset.server";
import { runFullOrchestration } from "@/lib/orchestrator";
import { generateFlightRiskHypothesis, type DedupeKeyed } from "@/lib/hypotheses";
import { isPlainObject, jsonError, logDuration, safeParseJson } from "@/lib/apiUtils";

export const dynamic = "force-dynamic";

const ROUTE = "api/autonomous/run";

export async function POST(req: Request) {
  const start = Date.now();

  // Enforce CRON_SECRET when configured, so this endpoint can be wired up to
  // an external scheduler without being publicly triggerable.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const provided = req.headers.get("x-cron-secret") ?? "";
    if (provided !== cronSecret) {
      logDuration(ROUTE, start);
      return jsonError(401, "UNAUTHORIZED", "Missing or invalid cron secret.");
    }
  }

  const body = await safeParseJson(req);
  if (body === undefined) {
    logDuration(ROUTE, start);
    return jsonError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
  if (body !== null && !isPlainObject(body)) {
    logDuration(ROUTE, start);
    return jsonError(400, "INVALID_BODY", "Request body must be a JSON object (or empty).");
  }

  try {
    const dataset = await fetchOrchestrationDataset();
    const result = runFullOrchestration(dataset);

    const existingDedupeKeys: DedupeKeyed[] = dataset.hypotheses.map((h) => ({ dedupeKey: h.dedupeKey }));
    let newHypotheses = 0;

    for (const person of result.people) {
      const candidate = generateFlightRiskHypothesis(person.id, person.name, person.flightRisk, existingDedupeKeys);
      if (!candidate) continue;

      await db.insert(hypothesesTable).values({
        id: candidate.id,
        personId: candidate.personId,
        type: candidate.type,
        title: candidate.title,
        sev: candidate.sev,
        status: "open",
        dedupeKey: candidate.dedupeKey,
      });
      await db.insert(notificationsTable).values({
        domain: "people",
        title: candidate.title,
        message: `Autonomous run flagged ${person.name} for elevated flight risk.`,
        sev: candidate.sev,
      });

      existingDedupeKeys.push({ dedupeKey: candidate.dedupeKey });
      newHypotheses += 1;
    }

    const refreshedDataset = newHypotheses > 0 ? await fetchOrchestrationDataset() : dataset;
    const refreshedResult = newHypotheses > 0 ? runFullOrchestration(refreshedDataset) : result;

    logDuration(ROUTE, start);
    return Response.json({ ok: true, newHypotheses, result: refreshedResult });
  } catch (err) {
    console.error(`[${ROUTE}] error`, err);
    logDuration(ROUTE, start);
    return jsonError(503, "DB_UNAVAILABLE", "Autonomous run failed.");
  }
}
