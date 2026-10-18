import { db } from "@/db";
import { applyHypothesisResolutionNudge } from "@/lib/selfImprove";
import { getHypothesisById, resolveHypothesisRow } from "@/lib/hypothesis";

export const dynamic = "force-dynamic";

// PATCH /api/hypothesis/:id — manually resolve a hypothesis.
// Body: { status: "confirmed" | "refuted", outcomeValue?: unknown }
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const hypothesisId = Number(id);
    if (Number.isNaN(hypothesisId)) {
      return Response.json({ ok: false, error: "invalid hypothesis id" }, { status: 400 });
    }

    const existing = await getHypothesisById(db, hypothesisId);
    if (!existing) {
      return Response.json({ ok: false, error: "hypothesis not found" }, { status: 404 });
    }
    if (existing.status !== "open") {
      return Response.json({ ok: false, error: "hypothesis already resolved" }, { status: 409 });
    }

    const body = await request.json().catch(() => ({}));
    const status = body?.status;
    if (status !== "confirmed" && status !== "refuted") {
      return Response.json(
        { ok: false, error: "status must be 'confirmed' or 'refuted'" },
        { status: 400 },
      );
    }

    const row = await resolveHypothesisRow(db, hypothesisId, status, body?.outcomeValue ?? { source: "manual" });
    await applyHypothesisResolutionNudge(db, existing.ruleKey, status === "confirmed");

    return Response.json({ ok: true, hypothesis: row });
  } catch (error) {
    console.error("[api/hypothesis/:id PATCH] failed", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 },
    );
  }
}

// GET /api/hypothesis/:id — convenience fetch of a single hypothesis.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const hypothesisId = Number(id);
    if (Number.isNaN(hypothesisId)) {
      return Response.json({ ok: false, error: "invalid hypothesis id" }, { status: 400 });
    }
    const row = await getHypothesisById(db, hypothesisId);
    if (!row) {
      return Response.json({ ok: false, error: "hypothesis not found" }, { status: 404 });
    }
    return Response.json({ ok: true, hypothesis: row });
  } catch (error) {
    console.error("[api/hypothesis/:id GET] failed", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 },
    );
  }
}
