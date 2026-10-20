import { NextResponse } from "next/server";
import { generateWeeklySynthesis, listSynthesisReports } from "@/lib/synthesis";

export const dynamic = "force-dynamic";

export async function GET() {
  const reports = await listSynthesisReports();
  return NextResponse.json({ reports });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { periodStart: string; periodEnd: string };
  if (!body.periodStart || !body.periodEnd) {
    return NextResponse.json({ error: "periodStart and periodEnd are required" }, { status: 400 });
  }
  const report = await generateWeeklySynthesis(body);
  return NextResponse.json(report, { status: 201 });
}
