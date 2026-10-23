import { NextRequest } from "next/server";
import { ideas } from "@/db/schema";
import { listRows, createRow, deleteRow, badRequest, ok } from "@/lib/leados/crud";
import { expectedCommercialValue, realOptionValue } from "@/lib/leados/calc";
import { desc } from "drizzle-orm";

function augment(row: Record<string, unknown>) {
  const probTechnical = Number(row.probTechnical);
  const probCommercial = Number(row.probCommercial);
  const npvUsd = Number(row.npvUsd);
  const remainingCostUsd = Number(row.remainingCostUsd);
  const hasKillCriteria = Boolean(row.killMetric && row.killThreshold && row.killByDate);
  return {
    ...row,
    ecv: expectedCommercialValue({ probTechnical, probCommercial, npvUsd, remainingCostUsd }),
    realOptionValue: realOptionValue({ probTechnical, probCommercial, npvUsd, remainingCostUsd }),
    hasKillCriteria,
  };
}

export async function GET() {
  const rows = await listRows(ideas, desc(ideas.id));
  return ok(rows.map(augment));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.title || !body.thesis) return badRequest("title and thesis are required");

  const stage = body.stage || "ideate";
  const hasKillCriteria = Boolean(body.killMetric && body.killThreshold && body.killByDate);
  // Stage-gate enforcement: pre-committed kill criteria are mandatory before 'build'.
  if (stage === "build" && !hasKillCriteria) {
    return badRequest("Ideas cannot enter 'build' without pre-committed kill criteria (metric, threshold, by-date).");
  }

  const row = await createRow(ideas, {
    title: body.title,
    kind: body.kind || "incremental",
    thesis: body.thesis,
    stage,
    trl: Number(body.trl) || 1,
    costToDateUsd: String(body.costToDateUsd ?? 0),
    remainingCostUsd: String(body.remainingCostUsd ?? 0),
    npvUsd: String(body.npvUsd ?? 0),
    probTechnical: String(body.probTechnical ?? 0.5),
    probCommercial: String(body.probCommercial ?? 0.5),
    killMetric: body.killMetric || null,
    killThreshold: body.killThreshold || null,
    killByDate: body.killByDate || null,
  });
  return ok(augment(row), 201);
}

export async function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return badRequest("id required");
  await deleteRow(ideas, ideas.id, id);
  return ok({ ok: true });
}
