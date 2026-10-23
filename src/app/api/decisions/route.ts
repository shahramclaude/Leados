import { appendDecision } from "@/lib/ledger";
import { getOrCreateDefaultTenant } from "@/lib/tenant";
import { db } from "@/db";
import { decisions } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const tenant = await getOrCreateDefaultTenant();
  if (!tenant) return Response.json({ error: "tenant unavailable" }, { status: 500 });

  const rows = await db
    .select()
    .from(decisions)
    .where(eq(decisions.tenantId, tenant.id))
    .orderBy(desc(decisions.createdAt))
    .limit(200);

  return Response.json({ decisions: rows });
}

export async function POST(request: Request) {
  const tenant = await getOrCreateDefaultTenant();
  if (!tenant) return Response.json({ error: "tenant unavailable" }, { status: 500 });

  const body = (await request.json()) as {
    subjectType?: string;
    subjectId?: string | null;
    title?: string;
    rationale?: string;
    outcome?: string;
    confidence?: number;
    confidenceLabel?: "measured" | "estimated" | "association" | "effect";
    evidence?: unknown[];
  };

  if (!body.subjectType || !body.title || !body.rationale) {
    return Response.json(
      { error: "subjectType, title, and rationale are required" },
      { status: 400 }
    );
  }

  const row = await appendDecision({
    tenantId: tenant.id,
    subjectType: body.subjectType,
    subjectId: body.subjectId ?? null,
    title: body.title,
    rationale: body.rationale,
    outcome: body.outcome,
    confidence: body.confidence,
    confidenceLabel: body.confidenceLabel,
    evidence: body.evidence,
    actor: "operator",
  });

  return Response.json({ decision: row }, { status: 201 });
}
