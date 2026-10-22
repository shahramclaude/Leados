import { db } from "@/db";
import { forecastQuestions } from "@/db/schema";
import { ensureSeedData, listQuestions } from "@/lib/sensing/db";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSeedData();
  const questions = await listQuestions();
  return Response.json({ questions });
}

export async function POST(req: Request) {
  await ensureSeedData();
  const body = await req.json().catch(() => ({}));
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const resolveBy = typeof body.resolveBy === "string" ? new Date(body.resolveBy) : null;
  const hypothesisId = typeof body.hypothesisId === "number" ? body.hypothesisId : null;
  if (!question || !resolveBy || Number.isNaN(resolveBy.getTime())) {
    return Response.json({ error: "question and a valid resolveBy date are required" }, { status: 400 });
  }
  const [row] = await db
    .insert(forecastQuestions)
    .values({ question, resolveBy, hypothesisId, status: "open" })
    .returning();
  return Response.json({ question: row }, { status: 201 });
}
