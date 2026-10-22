import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { leads, leadScores } from "@/db/schema";
import { getTenantBySlug, resolveTenantSlug } from "@/lib/tenant";
import type { Signals } from "@/lib/scoring";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const slug = await resolveTenantSlug(request);
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return Response.json({ error: `unknown tenant '${slug}'` }, { status: 404 });

  const rows = await db
    .select()
    .from(leads)
    .where(eq(leads.tenantId, tenant.id))
    .orderBy(desc(leads.createdAt));

  const scores = await db
    .select()
    .from(leadScores)
    .where(eq(leadScores.tenantId, tenant.id))
    .orderBy(desc(leadScores.computedAt));

  const latestScoreByLead = new Map<number, (typeof scores)[number]>();
  for (const score of scores) {
    if (!latestScoreByLead.has(score.leadId)) latestScoreByLead.set(score.leadId, score);
  }

  return Response.json({
    tenant: tenant.slug,
    leads: rows.map((lead) => ({ ...lead, latestScore: latestScoreByLead.get(lead.id) ?? null })),
  });
}

interface CreateLeadBody {
  name?: string;
  company?: string;
  email?: string;
  source?: string;
  signals?: Signals;
}

export async function POST(request: Request) {
  const slug = await resolveTenantSlug(request);
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return Response.json({ error: `unknown tenant '${slug}'` }, { status: 404 });

  const body = (await request.json().catch(() => null)) as CreateLeadBody | null;
  if (!body?.name || !body?.company || !body?.email) {
    return Response.json({ error: "name, company, email are required" }, { status: 400 });
  }

  const [lead] = await db
    .insert(leads)
    .values({
      tenantId: tenant.id,
      name: body.name,
      company: body.company,
      email: body.email,
      source: body.source ?? "manual",
      signals: body.signals ?? {},
    })
    .returning();

  return Response.json({ lead }, { status: 201 });
}
