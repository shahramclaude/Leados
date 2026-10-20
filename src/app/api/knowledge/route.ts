import { NextResponse } from "next/server";
import { db } from "@/db";
import { entities, relations } from "@/db/schema";
import { upsertEntity, type EntityInput } from "@/lib/knowledgeGraph";
import { computeGenome } from "@/lib/genome";

export const dynamic = "force-dynamic";

export async function GET() {
  const [entityRows, relationRows, genome] = await Promise.all([
    db.select().from(entities),
    db.select().from(relations),
    computeGenome(),
  ]);
  return NextResponse.json({
    entityCount: entityRows.length,
    relationCount: relationRows.length,
    entities: entityRows,
    relations: relationRows,
    genome,
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as EntityInput;
  if (!body.key || !body.type || !body.name) {
    return NextResponse.json({ error: "key, type and name are required" }, { status: 400 });
  }
  const row = await upsertEntity(body);
  return NextResponse.json(row, { status: 201 });
}
