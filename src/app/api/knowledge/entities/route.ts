import { NextRequest } from "next/server";
import { createEntity, listEntities, type EntityType } from "@/lib/knowledgeGraph";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") as EntityType | null;
  const q = searchParams.get("q");
  try {
    const rows = await listEntities({ type: type ?? undefined, q: q ?? undefined });
    return Response.json({ ok: true, entities: rows });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.type || !body.name) {
      return Response.json({ ok: false, error: "type and name are required" }, { status: 400 });
    }
    const entity = await createEntity({
      type: body.type,
      name: body.name,
      summary: body.summary,
      attributes: body.attributes,
    });
    return Response.json({ ok: true, entity }, { status: 201 });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
