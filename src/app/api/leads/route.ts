import { db } from "@/db";
import { leads } from "@/db/schema";
import { scoreLead, type LeadAttributes } from "@/lib/scoring";
import { appendDecision } from "@/lib/ledger";
import { getOrCreateDefaultTenant } from "@/lib/tenant";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const tenant = await getOrCreateDefaultTenant();
  if (!tenant) return Response.json({ error: "tenant unavailable" }, { status: 500 });

  const rows = await db
    .select()
    .from(leads)
    .where(eq(leads.tenantId, tenant.id))
    .orderBy(desc(leads.score), desc(leads.createdAt));

  return Response.json({ leads: rows });
}

export async function POST(request: Request) {
  const tenant = await getOrCreateDefaultTenant();
  if (!tenant) return Response.json({ error: "tenant unavailable" }, { status: 500 });

  const body = (await request.json()) as {
    name?: string;
    company?: string;
    email?: string;
    source?: string;
    attributes?: LeadAttributes;
  };

  if (!body.name || !body.company || !body.email) {
    return Response.json(
      { error: "name, company, and email are required" },
      { status: 400 }
    );
  }

  const attributes = body.attributes ?? {};
  const result = scoreLead(attributes);

  const [created] = await db
    .insert(leads)
    .values({
      tenantId: tenant.id,
      name: body.name,
      company: body.company,
      email: body.email,
      source: body.source ?? "manual",
      attributes,
      score: result.score,
      scoreBreakdown: result.breakdown,
    })
    .returning();

  await appendDecision({
    tenantId: tenant.id,
    subjectType: "lead",
    subjectId: created.id,
    title: `Scored lead "${created.name}" at ${created.company}`,
    rationale: `Deterministic scoring engine produced ${result.score}/100 (${result.label}). ${result.breakdown
      .map((b) => `${b.criterion}: +${b.contribution}`)
      .join("; ")}.`,
    outcome: result.label,
    confidence: 90,
    confidenceLabel: "measured",
    evidence: result.breakdown as unknown[],
    actor: "scoring-engine",
  });

  return Response.json({ lead: created, score: result }, { status: 201 });
}
