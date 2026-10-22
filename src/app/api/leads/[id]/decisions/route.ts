import { db } from "@/db";
import { decisions, leads } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { requireInternalOrgId } from "@/lib/tenant";
import { handleRouteError, jsonError } from "@/lib/api-response";
import { writeWithEnvelope } from "@/lib/envelope";
import { enforceLanguagePolicy } from "@/lib/language-policy";
import { makeExplain } from "@/lib/explain";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const orgId = requireInternalOrgId(req);
    const { id } = await params;
    const leadId = Number(id);
    const rows = await db
      .select()
      .from(decisions)
      .where(and(eq(decisions.orgId, orgId), eq(decisions.leadId, leadId)))
      .orderBy(desc(decisions.createdAt));
    return Response.json({ ok: true, decisions: rows });
  } catch (err) {
    return handleRouteError(err);
  }
}

// Human-authored decision (e.g. a rep manually recording a stage change with
// a rationale). Every decision — human or automated — passes through the
// same language policy + Explain<T> envelope so the UI never has to special
// case who authored it.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const orgId = requireInternalOrgId(req);
    const { id } = await params;
    const leadId = Number(id);
    const [lead] = await db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.orgId, orgId)));
    if (!lead) return jsonError("lead not found in this org", 404);

    const body = await req.json();
    const kind = typeof body.kind === "string" ? body.kind : "";
    const value = body.value;
    const confidence = typeof body.confidence === "number" ? body.confidence : 1;
    const rationaleRaw = typeof body.rationale === "string" ? body.rationale : "";
    if (!kind || value === undefined || !rationaleRaw) {
      return jsonError('"kind", "value" and "rationale" are required', 400);
    }

    const policy = enforceLanguagePolicy(rationaleRaw, confidence);
    const explain = makeExplain({
      value,
      confidence,
      basis: [`manual decision recorded by ${req.headers.get("x-actor-id") ?? "a human reviewer"}`],
      generatedBy: "human",
      policyViolations: policy.violations,
    });

    const decision = await writeWithEnvelope({
      orgId,
      actorType: "human",
      actorId: req.headers.get("x-actor-id") ?? "unknown-human",
      entityType: "decision",
      entityId: (result) => String((result as { id: number }).id),
      action: `decision.${kind}`,
      reason: policy.text,
      mutate: async () => {
        const [row] = await db
          .insert(decisions)
          .values({
            orgId,
            leadId,
            kind,
            value: explain.value as object,
            confidence: String(confidence),
            basis: explain.basis,
            rationale: policy.text,
            actorType: "human",
            actorId: req.headers.get("x-actor-id") ?? "unknown-human",
            languagePolicyViolations: policy.violations,
          })
          .returning();
        return row;
      },
      after: (row) => row,
    });

    return Response.json({ ok: true, decision, explain }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
