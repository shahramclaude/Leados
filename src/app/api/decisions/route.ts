import { db } from "@/db";
import { decisions, decisionCriteria, decisionOptions } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { jsonError, isRecord, parseNumber, parseString, readJsonBody } from "@/lib/api";
import { generatePreMortem } from "@/lib/decisionEngine";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(decisions).orderBy(desc(decisions.createdAt));
  const criteria = await db.select().from(decisionCriteria);
  const options = await db.select().from(decisionOptions);
  const enriched = rows.map((d) => ({
    ...d,
    criteria: criteria.filter((c) => c.decisionId === d.id),
    options: options.filter((o) => o.decisionId === d.id),
  }));
  return Response.json(enriched);
}

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (typeof body.title !== "string" || body.title.trim() === "") return jsonError("title is required");

  try {
    const [decision] = await db
      .insert(decisions)
      .values({
        title: body.title,
        domain: parseString(body.domain, "operations"),
        status: "proposed",
        context: typeof body.context === "string" ? body.context : null,
        doorType: parseString(body.doorType, "two_way"),
        impact: parseNumber(body.impact, 3),
        deadline: typeof body.deadline === "string" ? body.deadline : null,
        preMortem: generatePreMortem(),
      })
      .returning();

    const criteriaInput = Array.isArray(body.criteria) ? body.criteria : [{ name: "Strategic fit", weight: 0.34 }, { name: "Cost", weight: 0.33 }, { name: "Speed", weight: 0.33 }];
    const criteriaRows = await db
      .insert(decisionCriteria)
      .values(criteriaInput.map((c: unknown) => ({ decisionId: decision.id, name: parseString(isRecord(c) ? c.name : undefined, "Criterion"), weight: parseNumber(isRecord(c) ? c.weight : undefined, 0.25) })))
      .returning();

    const optionsInput = Array.isArray(body.options) ? body.options : [];
    const optionRows = optionsInput.length
      ? await db
          .insert(decisionOptions)
          .values(
            optionsInput.map((o: unknown) => ({
              decisionId: decision.id,
              label: parseString(isRecord(o) ? o.label : undefined, "Option"),
              description: isRecord(o) && typeof o.description === "string" ? o.description : null,
              criteriaScores: isRecord(o) && isRecord(o.criteriaScores) ? o.criteriaScores : {},
              estimatedValue: parseNumber(isRecord(o) ? o.estimatedValue : undefined, 0),
              uncertaintyLow: parseNumber(isRecord(o) ? o.uncertaintyLow : undefined, 0),
              uncertaintyHigh: parseNumber(isRecord(o) ? o.uncertaintyHigh : undefined, 0),
              probabilityOfSuccess: parseNumber(isRecord(o) ? o.probabilityOfSuccess : undefined, 0.6),
            })),
          )
          .returning()
      : [];

    return Response.json({ ...decision, criteria: criteriaRows, options: optionRows }, { status: 201 });
  } catch (err) {
    return jsonError((err as Error).message, 500);
  }
}

export async function PATCH(request: Request) {
  // Convenience bulk endpoint: add a single option to an existing decision.
  const body = await readJsonBody(request);
  const decisionId = parseNumber(body.decisionId, 0);
  if (!decisionId) return jsonError("decisionId is required");
  const [option] = await db
    .insert(decisionOptions)
    .values({
      decisionId,
      label: parseString(body.label, "Option"),
      description: typeof body.description === "string" ? body.description : null,
      criteriaScores: isRecord(body.criteriaScores) ? body.criteriaScores : {},
      estimatedValue: parseNumber(body.estimatedValue, 0),
      uncertaintyLow: parseNumber(body.uncertaintyLow, 0),
      uncertaintyHigh: parseNumber(body.uncertaintyHigh, 0),
      probabilityOfSuccess: parseNumber(body.probabilityOfSuccess, 0.6),
    })
    .returning();
  const [decision] = await db.select().from(decisions).where(eq(decisions.id, decisionId)).limit(1);
  return Response.json({ decision, option }, { status: 201 });
}
