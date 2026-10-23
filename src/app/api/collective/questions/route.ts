import { NextRequest, NextResponse } from "next/server";
import { createQuestion, listQuestions } from "@/lib/collective/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const questions = await listQuestions();
  return NextResponse.json({ questions });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!body?.title || typeof body.title !== "string") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const question = await createQuestion({
    title: body.title,
    description: body.description,
    questionClass: body.questionClass,
    modelProbability: typeof body.modelProbability === "number" ? body.modelProbability : undefined,
  });
  return NextResponse.json({ question }, { status: 201 });
}
