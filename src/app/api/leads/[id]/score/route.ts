import { eq } from "drizzle-orm";
import { db } from "@/db";
import { decisions, leadScores, leads, rules } from "@/db/schema";
import { getTenantBySlug, resolveTenantSlug } from "@/lib/tenant";
import { scoreLead, type ScoringRule, type Signals } from "@/lib/scoring";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const leadId = Number(id);
  if (!Number.isInteger(leadId)) {
    return Response.json({ error: "invalid lead id" }, { status: 400 });
  }

  const slug = await resolveTenantSlug(request);
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return Response.json({ error: `unknown tenant '${slug}'` }, { status: 404 });

  const [lead] = await db
    .select()
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);

  if (!lead || lead.tenantId !== tenant.id) {
    return Response.json({ error: "lead not found for tenant" }, { status: 404 });
  }

  const activeRules = await db
    .select()
    .from(rules)
    .where(eq(rules.tenantId, tenant.id));

  const scoringRules: ScoringRule[] = activeRules
    .filter((rule) => rule.active)
    .map((rule) => ({
      name: rule.name,
      field: rule.field,
      operator: rule.operator as ScoringRule["operator"],
      value: rule.value,
      weight: rule.weight,
    }));

  // Rules may reference either a custom signal (e.g. employeeCount, stored in
  // the `signals` jsonb column) or a first-class lead column (currently just
  // `source`). Merge them so both kinds of rules resolve correctly.
  const signalsWithLeadFields: Signals = { source: lead.source, ...(lead.signals as Signals) };
  const result = scoreLead(signalsWithLeadFields, scoringRules);

  const [savedScore] = await db
    .insert(leadScores)
    .values({
      tenantId: tenant.id,
      leadId: lead.id,
      score: result.score,
      band: result.band,
      breakdown: result.breakdown,
    })
    .returning();

  await db.insert(decisions).values({
    tenantId: tenant.id,
    leadId: lead.id,
    type: "scored",
    actor: "system",
    summary: `Scored "${lead.name}" (${lead.company}) at ${result.score}/100 — ${result.band}.`,
    evidence: { rulesEvaluated: scoringRules.length, breakdown: result.breakdown },
  });

  return Response.json({ score: savedScore });
}
