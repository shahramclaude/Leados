import { NextResponse } from "next/server";
import { upsertRelation, type RelationInput } from "@/lib/knowledgeGraph";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as RelationInput;
  if (!body.fromKey || !body.toKey || !body.type) {
    return NextResponse.json({ error: "fromKey, toKey and type are required" }, { status: 400 });
  }
  try {
    const row = await upsertRelation(body);
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
