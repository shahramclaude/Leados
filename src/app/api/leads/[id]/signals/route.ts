import { db } from "@/db";
import { leads, signals } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireInternalOrgId } from "@/lib/tenant";
import { handleRouteError, jsonError } from "@/lib/api-response";
import { writeWithEnvelope } from "@/lib/envelope";
import { scoreLead } from "@/lib/scoring";
import { scanForInjectionAttempt } from "@/lib/injection-guard";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const orgId = requireInternalOrgId(req);
    const { id } = await params;
    const leadId = Number(id);
    const rows = await db
      .select()
      .from(signals)
      .where(and(eq(signals.orgId, orgId), eq(signals.leadId, leadId)));
    return Response.json({ ok: true, signals: rows });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const orgId = requireInternalOrgId(req);
    const { id } = await params;
    const leadId = Number(id);
    if (!Number.isInteger(leadId)) return jsonError("invalid lead id", 400);

    const [lead] = await db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.orgId, orgId)));
    if (!lead) return jsonError("lead not found in this org", 404);

    const body = await req.json();
    const type = typeof body.type === "string" ? body.type : "";
    const source = typeof body.source === "string" ? body.source : "manual";
    const confidence = typeof body.confidence === "number" ? body.confidence : 1;
    const payload = typeof body.payload === "object" && body.payload !== null ? body.payload : {};
    if (!type) return jsonError('"type" is required', 400);

    // Untrusted-source scan: webhook/import-sourced payloads are scanned for
    // instruction-like phrasing (prompt-injection guard, Part 22 red-team).
    const payloadText = JSON.stringify(payload);
    const scan = source !== "manual" ? scanForInjectionAttempt(payloadText) : { suspicious: false, matches: [] };

    const signal = await writeWithEnvelope({
      orgId,
      actorType: source === "manual" ? "human" : "system",
      actorId: req.headers.get("x-actor-id") ?? source,
      entityType: "signal",
      entityId: (result) => String((result as { id: number }).id),
      action: "signal.create",
      reason: scan.suspicious
        ? `signal ingested from "${source}"; injection-like phrasing flagged and treated as inert data`
        : `signal ingested from "${source}"`,
      mutate: async () => {
        const [row] = await db
          .insert(signals)
          .values({ orgId, leadId, type, source, confidence: String(confidence), payload })
          .returning();
        return row;
      },
      after: (row) => ({ ...row, injectionScan: scan }),
    });

    const allSignals = await db
      .select()
      .from(signals)
      .where(and(eq(signals.orgId, orgId), eq(signals.leadId, leadId)));
    const explain = scoreLead(
      allSignals.map((s) => ({ type: s.type, confidence: Number(s.confidence), createdAt: s.createdAt })),
    );

    await writeWithEnvelope({
      orgId,
      actorType: "system",
      actorId: "scoring-engine",
      entityType: "lead",
      entityId: String(leadId),
      action: "lead.rescore",
      reason: "recomputed after new signal",
      before: { score: lead.score, scoreConfidence: lead.scoreConfidence },
      mutate: async () => {
        const [row] = await db
          .update(leads)
          .set({ score: String(explain.value), scoreConfidence: String(explain.confidence), updatedAt: new Date() })
          .where(eq(leads.id, leadId))
          .returning();
        return row;
      },
      after: (row) => row,
    });

    return Response.json({ ok: true, signal, scoreExplain: explain }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
