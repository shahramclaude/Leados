import { NextRequest } from "next/server";
import { listMemories, recordMemory, type MemoryClass } from "@/lib/institutionalMemory";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cls = searchParams.get("class") as MemoryClass | null;
  const includeArchived = searchParams.get("includeArchived") === "true";
  const entityId = searchParams.get("entityId");
  try {
    const rows = await listMemories({ class: cls ?? undefined, includeArchived, entityId: entityId ?? undefined });
    return Response.json({ ok: true, memories: rows });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const required = ["class", "title", "content", "provenanceSource", "sourceType"];
    for (const f of required) {
      if (!body[f]) return Response.json({ ok: false, error: `${f} is required` }, { status: 400 });
    }
    const memory = await recordMemory(body);
    return Response.json({ ok: true, memory }, { status: 201 });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
