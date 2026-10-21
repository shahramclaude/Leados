import { NextResponse } from "next/server";
import { deleteSavedSearch, listSavedSearches, saveSearch } from "@/lib/search";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ownerName = searchParams.get("ownerName") ?? undefined;
  const rows = await listSavedSearches(ownerName);
  return NextResponse.json({ savedSearches: rows });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { ownerName?: string; query?: string; filters?: Record<string, unknown> };
  if (!body.ownerName || !body.query) return NextResponse.json({ error: "ownerName and query are required" }, { status: 400 });
  const row = await saveSearch(body.ownerName, body.query, body.filters ?? {});
  return NextResponse.json(row, { status: 201 });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  await deleteSavedSearch(Number(id));
  return NextResponse.json({ ok: true });
}
