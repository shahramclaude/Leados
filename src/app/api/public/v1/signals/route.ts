import { db } from "@/db";
import { leads, signals } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requirePublicOrgId } from "@/lib/tenant";
import { assertRouteRegistered } from "@/lib/registry";
import { handleRouteError, jsonError } from "@/lib/api-response";
import { writeWithEnvelope } from "@/lib/envelope";
import { scanForInjectionAttempt } from "@/lib/injection-guard";

export const dynamic = "force-dynamic";

const MAX_PAYLOAD_BYTES = 8_192;

// The "hostile webhook" surface: an external, semi-trusted system posts a
// signal about a lead it claims exists in the caller's org. This is the
// highest-risk ingress point in the product (untrusted body, cross-tenant
// targeting risk, potential prompt-injection payloads later read by agent
// tools) — see docs/RED-TEAM-2026.md SEC-03/SEC-04 for what is and is not
// mitigated yet.
export async function POST(req: Request) {
  try {
    assertRouteRegistered("/api/public/v1/signals");
    const orgId = await requirePublicOrgId(req);

    const raw = await req.text();
    if (raw.length > MAX_PAYLOAD_BYTES) {
      return jsonError(`payload exceeds ${MAX_PAYLOAD_BYTES} byte limit`, 413);
    }
    const body = JSON.parse(raw || "{}");

    const leadId = Number(body.leadId);
    const type = typeof body.type === "string" ? body.type : "";
    const confidence = typeof body.confidence === "number" ? Math.max(0, Math.min(1, body.confidence)) : 0.5;
    const payload = typeof body.payload === "object" && body.payload !== null ? body.payload : {};
    if (!Number.isInteger(leadId) || !type) {
      return jsonError('"leadId" and "type" are required', 400);
    }

    // Cross-tenant targeting guard: the lead must belong to the SAME org the
    // API key resolved to, otherwise a leaked lead id from org A could be
    // used to inject a signal while authenticated as org B.
    const [lead] = await db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.orgId, orgId)));
    if (!lead) {
      return jsonError("lead not found in the authenticated org", 404);
    }

    const scan = scanForInjectionAttempt(JSON.stringify(payload));

    const signal = await writeWithEnvelope({
      orgId,
      actorType: "system",
      actorId: "public-webhook",
      entityType: "signal",
      entityId: (r) => String((r as { id: number }).id),
      action: "signal.ingest_webhook",
      reason: scan.suspicious
        ? "external webhook signal flagged by injection guard; stored as inert data only"
        : "external webhook signal ingested",
      mutate: async () => {
        const [row] = await db
          .insert(signals)
          .values({ orgId, leadId, type, source: "public_webhook", confidence: String(confidence), payload })
          .returning();
        return row;
      },
      after: (row) => ({ ...row, injectionScan: scan }),
    });

    return Response.json({ ok: true, signal }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
