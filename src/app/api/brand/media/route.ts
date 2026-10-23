import { NextRequest } from "next/server";
import { mediaItems } from "@/db/schema";
import { listRows, createRow, deleteRow, badRequest, ok } from "@/lib/leados/crud";
import { mediaExposure } from "@/lib/leados/calc";
import { desc } from "drizzle-orm";

function augment(row: Record<string, unknown>) {
  return { ...row, exposure: mediaExposure(Number(row.reach), Number(row.sourceReliability)) };
}

export async function GET() {
  const rows = await listRows(mediaItems, desc(mediaItems.id));
  return ok(rows.map(augment));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.source) return badRequest("source is required");
  const row = await createRow(mediaItems, {
    source: body.source,
    sourceReliability: String(body.sourceReliability ?? 0.5),
    reach: Number(body.reach) || 0,
    sentiment: String(body.sentiment ?? 0),
    topics: body.topics || "",
    verified: body.verified || "unverified",
    mentionsUs: body.mentionsUs === true || body.mentionsUs === "true",
  });
  return ok(augment(row), 201);
}

export async function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return badRequest("id required");
  await deleteRow(mediaItems, mediaItems.id, id);
  return ok({ ok: true });
}
