import { db } from "@/db";
import { domains, people } from "@/db/schema";
import { createHypothesis, listOpenHypotheses, type HypothesisEntityType } from "@/lib/hypothesis";
import { inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function withEntityNames(hypotheses: Awaited<ReturnType<typeof listOpenHypotheses>>) {
  const personIds = hypotheses
    .filter((h) => h.entityType === "person")
    .map((h) => Number(h.entityId))
    .filter((n) => !Number.isNaN(n));
  const domainIds = hypotheses
    .filter((h) => h.entityType === "domain")
    .map((h) => Number(h.entityId))
    .filter((n) => !Number.isNaN(n));

  const peopleRows = personIds.length
    ? await db.select().from(people).where(inArray(people.id, personIds))
    : [];
  const domainRows = domainIds.length
    ? await db.select().from(domains).where(inArray(domains.id, domainIds))
    : [];

  const peopleById = new Map(peopleRows.map((p) => [p.id, p.name]));
  const domainsById = new Map(domainRows.map((d) => [d.id, d.name]));

  return hypotheses.map((h) => {
    let entityName: string | null = null;
    if (h.entityType === "person") entityName = peopleById.get(Number(h.entityId)) ?? null;
    if (h.entityType === "domain") entityName = domainsById.get(Number(h.entityId)) ?? null;
    return { ...h, entityName };
  });
}

// GET /api/hypothesis — returns all open hypotheses with entity names joined.
export async function GET() {
  try {
    const open = await listOpenHypotheses(db);
    const withNames = await withEntityNames(open);
    return Response.json({ ok: true, hypotheses: withNames });
  } catch (error) {
    console.error("[api/hypothesis GET] failed", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 },
    );
  }
}

const VALID_ENTITY_TYPES: HypothesisEntityType[] = ["person", "domain", "causal_chain"];

// POST /api/hypothesis — manual hypothesis creation with the same schema
// the autonomous agent uses (id, key, entity_id, entity_type, claim,
// predicted_by, resolve_by, status, outcome_value, created_at).
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { key, entityId, entityType, claim, ruleKey, resolveByDays } = body ?? {};

    if (typeof key !== "string" || !key.trim()) {
      return Response.json({ ok: false, error: "key is required" }, { status: 400 });
    }
    if (typeof entityId !== "string" && typeof entityId !== "number") {
      return Response.json({ ok: false, error: "entityId is required" }, { status: 400 });
    }
    if (!VALID_ENTITY_TYPES.includes(entityType)) {
      return Response.json(
        { ok: false, error: `entityType must be one of ${VALID_ENTITY_TYPES.join(", ")}` },
        { status: 400 },
      );
    }
    if (typeof claim !== "string" || !claim.trim()) {
      return Response.json({ ok: false, error: "claim is required" }, { status: 400 });
    }

    const days = typeof resolveByDays === "number" && resolveByDays > 0 ? resolveByDays : 30;
    const now = new Date();
    const resolveBy = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const row = await createHypothesis(db, {
      key,
      entityId: String(entityId),
      entityType,
      claim,
      ruleKey: typeof ruleKey === "string" ? ruleKey : null,
      predictedBy: now,
      resolveBy,
    });

    if (!row) {
      return Response.json(
        { ok: false, error: "An open hypothesis already exists for this key+entity" },
        { status: 409 },
      );
    }

    return Response.json({ ok: true, hypothesis: row }, { status: 201 });
  } catch (error) {
    console.error("[api/hypothesis POST] failed", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 },
    );
  }
}
