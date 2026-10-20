import { NextResponse } from "next/server";
import { listHypotheses, registerHypothesis, scoreForecasters, type HypothesisStatus, type RegisterHypothesisInput } from "@/lib/hypotheses";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") as HypothesisStatus | null;
  const [rows, forecasters] = await Promise.all([
    listHypotheses(status ?? undefined),
    scoreForecasters(),
  ]);
  return NextResponse.json({ hypotheses: rows, forecasters });
}

export async function POST(request: Request) {
  const body = (await request.json()) as RegisterHypothesisInput;
  if (!body.key || !body.title || !body.ownerName) {
    return NextResponse.json({ error: "key, title and ownerName are required" }, { status: 400 });
  }
  try {
    const row = await registerHypothesis(body);
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
