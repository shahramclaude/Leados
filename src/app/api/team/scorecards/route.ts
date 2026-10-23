import { NextRequest } from "next/server";
import { decisionScorecards } from "@/db/schema";
import { listRows, createRow, deleteRow, badRequest, ok } from "@/lib/leados/crud";
import { decisionQualityScore } from "@/lib/leados/calc";
import { desc } from "drizzle-orm";

function augment(row: Record<string, unknown>) {
  return {
    ...row,
    score: decisionQualityScore({
      optionsConsidered: Number(row.optionsConsidered),
      dissentSought: Boolean(row.dissentSought),
      assumptionsLabeled: Boolean(row.assumptionsLabeled),
      predictionsMade: Boolean(row.predictionsMade),
      reviewScheduled: Boolean(row.reviewScheduled),
      outcomeScored: Boolean(row.outcomeScored),
    }),
  };
}

export async function GET() {
  const rows = await listRows(decisionScorecards, desc(decisionScorecards.id));
  return ok(rows.map(augment));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.decisionTitle) return badRequest("decisionTitle is required");
  const row = await createRow(decisionScorecards, {
    decisionTitle: body.decisionTitle,
    optionsConsidered: Number(body.optionsConsidered) || 0,
    dissentSought: body.dissentSought === true || body.dissentSought === "true",
    assumptionsLabeled: body.assumptionsLabeled === true || body.assumptionsLabeled === "true",
    predictionsMade: body.predictionsMade === true || body.predictionsMade === "true",
    reviewScheduled: body.reviewScheduled === true || body.reviewScheduled === "true",
    outcomeScored: body.outcomeScored === true || body.outcomeScored === "true",
  });
  return ok(augment(row), 201);
}

export async function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return badRequest("id required");
  await deleteRow(decisionScorecards, decisionScorecards.id, id);
  return ok({ ok: true });
}
