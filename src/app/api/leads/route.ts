import { db } from "@/db";
import { leads } from "@/db/schema";
import { getOrCreateDemoTenant } from "@/lib/tenant";
import { computeScore, type TitleSeniority } from "@/lib/scoring";
import { appendDecision } from "@/lib/ledger";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const VALID_SENIORITY: TitleSeniority[] = [
  "c_suite",
  "vp",
  "director",
  "manager",
  "individual_contributor",
];

export async function GET() {
  const tenant = await getOrCreateDemoTenant();
  const rows = await db
    .select()
    .from(leads)
    .where(eq(leads.tenantId, tenant.id))
    .orderBy(desc(leads.score));

  return Response.json({ leads: rows });
}

export async function POST(request: Request) {
  const tenant = await getOrCreateDemoTenant();
  const body = await request.json().catch(() => null);

  if (!body || typeof body.name !== "string" || typeof body.company !== "string") {
    return Response.json(
      { error: "name and company are required fields" },
      { status: 400 },
    );
  }

  const titleSeniority: TitleSeniority = VALID_SENIORITY.includes(body.titleSeniority)
    ? body.titleSeniority
    : "individual_contributor";

  const scoringInput = {
    budget: Number(body.budget) || 0,
    companySize: Number(body.companySize) || 0,
    engagementScore: Number(body.engagementScore) || 0,
    titleSeniority,
    icpFit: Number(body.icpFit) || 0,
    responseHistory: Number(body.responseHistory) || 0,
  };

  const { total, breakdown } = computeScore(scoringInput);

  const [lead] = await db
    .insert(leads)
    .values({
      tenantId: tenant.id,
      name: body.name,
      company: body.company,
      title: typeof body.title === "string" ? body.title : "",
      email: typeof body.email === "string" ? body.email : "",
      budget: String(scoringInput.budget),
      dealValue: String(Number(body.dealValue) || 0),
      companySize: scoringInput.companySize,
      engagementScore: scoringInput.engagementScore,
      titleSeniority,
      icpFit: scoringInput.icpFit,
      responseHistory: scoringInput.responseHistory,
      stage: "new",
      score: total,
      scoreBreakdown: breakdown,
    })
    .returning();

  await appendDecision({
    tenantId: tenant.id,
    entityType: "lead",
    entityId: lead.id,
    action: "lead.created",
    payload: { score: total, breakdown },
    rationale: `Lead "${lead.name}" at ${lead.company} created and scored ${total}/100.`,
  });

  return Response.json({ lead }, { status: 201 });
}
