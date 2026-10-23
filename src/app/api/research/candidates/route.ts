import { NextRequest } from "next/server";
import { methodCandidates } from "@/db/schema";
import { listRows, createRow, deleteRow, badRequest, ok } from "@/lib/leados/crud";
import { isSignificantImprovement } from "@/lib/leados/calc";
import { desc } from "drizzle-orm";

const WEAK_EVIDENCE = new Set(["anecdotal"]);

function augment(row: Record<string, unknown>) {
  const proposed = row.proposedEvalScore === null || row.proposedEvalScore === undefined ? undefined : Number(row.proposedEvalScore);
  const significant = proposed !== undefined ? isSignificantImprovement(Number(row.currentEvalScore), proposed) : false;
  return { ...row, significant };
}

export async function GET() {
  const rows = await listRows(methodCandidates, desc(methodCandidates.id));
  return ok(rows.map(augment));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.targetEngine || !body.proposedName) return badRequest("targetEngine and proposedName are required");

  // A single anecdote-grade source cannot move production. Adoption is
  // blocked outright at this grade; the candidate can still be logged for
  // tracking but is forced into 'defer'.
  const evidenceGrade = body.evidenceGrade || "practitioner";
  let decision = body.decision || "pilot";
  if (WEAK_EVIDENCE.has(evidenceGrade) && decision === "adopt") {
    decision = "defer";
  }

  const row = await createRow(methodCandidates, {
    targetEngine: body.targetEngine,
    currentName: body.currentName || "incumbent",
    currentEvalScore: String(body.currentEvalScore ?? 0),
    proposedName: body.proposedName,
    proposedEvalScore: body.proposedEvalScore !== undefined && body.proposedEvalScore !== "" ? String(body.proposedEvalScore) : null,
    evidenceGrade,
    decision,
    rationale: body.rationale || "",
  });
  return ok(augment(row), 201);
}

export async function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return badRequest("id required");
  await deleteRow(methodCandidates, methodCandidates.id, id);
  return ok({ ok: true });
}
