import { db } from "@/db";
import { oneOnOnes, decisions, metricDefs, metricValues, events, people } from "@/db/schema";
import { eq } from "drizzle-orm";
import { classifyCapture } from "@/lib/classify";
import { cachedJson, jsonError, isRecord } from "@/lib/api";
import type { CaptureType } from "@/lib/types";

export const dynamic = "force-dynamic";

function extractPersonName(text: string, names: string[]): string | null {
  const lower = text.toLowerCase();
  for (const name of names) {
    if (lower.includes(name.toLowerCase())) return name;
  }
  return null;
}

function extractNumber(text: string): number | null {
  const match = text.match(/-?\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
}

export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json();
  if (!isRecord(body) || typeof body.text !== "string" || body.text.trim() === "") {
    return jsonError("text is required");
  }
  const text = body.text.trim();
  const overrideType = typeof body.type === "string" ? (body.type as CaptureType) : null;

  const classification = classifyCapture(text);
  const type = overrideType ?? classification.type;

  const allPeople = await db.select().from(people);
  const allMetricDefs = await db.select().from(metricDefs);

  let routed: unknown = null;

  if (type === "one_on_one") {
    const personName = extractPersonName(text, allPeople.map((p) => p.name));
    const person = personName ? allPeople.find((p) => p.name === personName) : allPeople[0];
    if (person) {
      const [created] = await db
        .insert(oneOnOnes)
        .values({ personId: person.id, notes: text, sentiment: 0, actionItems: [] })
        .returning();
      await db.update(people).set({ lastOneOnOneAt: new Date() }).where(eq(people.id, person.id));
      routed = { table: "one_on_ones", record: created };
    }
  } else if (type === "decision") {
    const [created] = await db
      .insert(decisions)
      .values({
        title: text.length > 80 ? `${text.slice(0, 77)}...` : text,
        description: text,
        owner: allPeople[0]?.name ?? "Unassigned",
        domain: "execution",
        status: "proposed",
        confidence: 50,
      })
      .returning();
    routed = { table: "decisions", record: created };
  } else if (type === "metric_update") {
    const value = extractNumber(text);
    const metric =
      allMetricDefs.find((m) => text.toLowerCase().includes(m.key.toLowerCase())) ?? allMetricDefs[0];
    if (metric && value !== null) {
      const [created] = await db
        .insert(metricValues)
        .values({ metricKey: metric.key, value: String(value) })
        .returning();
      routed = { table: "metric_values", record: created };
    }
  } else if (type === "incident") {
    const [created] = await db
      .insert(events)
      .values({
        type: "incident",
        domain: "execution",
        severity: 4,
        title: text.length > 80 ? `${text.slice(0, 77)}...` : text,
        description: text,
        source: "quick-capture",
      })
      .returning();
    routed = { table: "events", record: created };
  } else {
    const [created] = await db
      .insert(events)
      .values({
        type: "feedback",
        domain: "product",
        severity: 1,
        title: text.length > 80 ? `${text.slice(0, 77)}...` : text,
        description: text,
        source: "quick-capture",
      })
      .returning();
    routed = { table: "events", record: created };
  }

  return cachedJson({ classification, type, routed });
}
