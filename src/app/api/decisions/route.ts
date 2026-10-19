import { NextResponse } from "next/server";
import { db } from "@/db";
import { decisions as decisionsTable } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(decisionsTable);
  return NextResponse.json({ decisions: rows });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const {
    title,
    description,
    domain,
    status,
    impact,
    probability,
    deadline,
    optionCostToDecide,
    optionVolatility,
    context,
  } = body as Record<string, unknown>;

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const [created] = await db
    .insert(decisionsTable)
    .values({
      title: String(title),
      description: description ? String(description) : null,
      domain: domain ? String(domain) : "general",
      status: status ? String(status) : "open",
      impact: impact !== undefined ? Number(impact) : 3,
      probability: probability !== undefined ? String(probability) : "0.5",
      deadline: deadline ? new Date(String(deadline)) : null,
      optionCostToDecide: optionCostToDecide !== undefined ? String(optionCostToDecide) : "10000",
      optionVolatility: optionVolatility !== undefined ? String(optionVolatility) : "0.35",
      context: (context as Record<string, unknown>) ?? {},
    })
    .returning();

  return NextResponse.json({ decision: created }, { status: 201 });
}
