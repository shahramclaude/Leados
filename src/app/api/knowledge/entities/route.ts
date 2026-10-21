import { NextResponse } from "next/server";
import { listEntities, upsertEntity, type EntityType } from "@/lib/knowledgeGraph";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? undefined;
  const rows = await listEntities(type);
  return NextResponse.json({ entities: rows });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { key?: string; type?: EntityType; name?: string; attributes?: Record<string, unknown> };
  if (!body.key || !body.type || !body.name) {
    return NextResponse.json({ error: "key, type and name are required" }, { status: 400 });
  }
  const row = await upsertEntity({ key: body.key, type: body.type, name: body.name, attributes: body.attributes });
  return NextResponse.json(row, { status: 201 });
}
