import { db } from "@/db";
import { people, events, ruleEvaluations } from "@/db/schema";
import { desc } from "drizzle-orm";
import { cachedJson } from "@/lib/api";

export const dynamic = "force-dynamic";

const SCHEMA_VERSION = "10.0.0";
const APP_VERSION = "1.0.0";

export async function GET(): Promise<Response> {
  const [peopleRows, eventRows, lastEval] = await Promise.all([
    db.select().from(people),
    db.select().from(events),
    db.select().from(ruleEvaluations).orderBy(desc(ruleEvaluations.evaluatedAt)).limit(1),
  ]);

  return cachedJson({
    appVersion: APP_VERSION,
    schemaVersion: SCHEMA_VERSION,
    totalEvents: eventRows.length,
    totalPeople: peopleRows.length,
    lastIntelligenceRun: lastEval.length > 0 ? new Date(lastEval[0].evaluatedAt).toISOString() : null,
  });
}
