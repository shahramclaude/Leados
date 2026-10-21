import { NextResponse } from "next/server";
import { createDoc, listDocs, type CreateDocInput } from "@/lib/docs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const isLivingParam = searchParams.get("isLiving");
  const rows = await listDocs({
    entityId: searchParams.get("entityId") ?? undefined,
    isLiving: isLivingParam === null ? undefined : isLivingParam === "true",
    status: searchParams.get("status") ?? undefined,
  });
  return NextResponse.json({ docs: rows });
}

export async function POST(request: Request) {
  const body = (await request.json()) as CreateDocInput;
  if (!body.title || !body.blocks?.length) return NextResponse.json({ error: "title and at least one block are required" }, { status: 400 });
  const row = await createDoc(body);
  return NextResponse.json(row, { status: 201 });
}
