import { NextRequest } from "next/server";
import { teamDiagnostics } from "@/db/schema";
import { listRows, createRow, deleteRow, badRequest, ok } from "@/lib/leados/crud";
import { passesKAnonymity, K_ANON_THRESHOLD } from "@/lib/leados/calc";
import { desc } from "drizzle-orm";

// NOTE: there is intentionally no "person" column anywhere in this table and
// no per-person read path exists anywhere in the API surface. Diagnostics
// below the k-anonymity threshold are rejected outright, never stored
// partially and hidden — the guarantee holds at write time too.
export async function GET() {
  const rows = await listRows(teamDiagnostics, desc(teamDiagnostics.id));
  // Defense in depth: even if a low-n row somehow existed, never render it.
  return ok(rows.filter((r: Record<string, unknown>) => passesKAnonymity(Number(r.sampleSizeN))));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.teamName || !body.dimension || body.score === undefined) {
    return badRequest("teamName, dimension and score are required");
  }
  const n = Number(body.sampleSizeN) || 0;
  if (!passesKAnonymity(n)) {
    return badRequest(`k-anonymity violation: sample size must be >= ${K_ANON_THRESHOLD}. This is never an individual score.`);
  }
  const row = await createRow(teamDiagnostics, {
    teamName: body.teamName,
    dimension: body.dimension,
    score: String(body.score),
    method: body.method || "consent-survey",
    sampleSizeN: n,
    ciLow: body.ciLow ? String(body.ciLow) : null,
    ciHigh: body.ciHigh ? String(body.ciHigh) : null,
  });
  return ok(row, 201);
}

export async function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return badRequest("id required");
  await deleteRow(teamDiagnostics, teamDiagnostics.id, id);
  return ok({ ok: true });
}
