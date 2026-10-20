import { NextResponse } from "next/server";
import { createLivingDoc, listLivingDocs } from "@/lib/livingDocs";

export const dynamic = "force-dynamic";

export async function GET() {
  const docs = await listLivingDocs();
  return NextResponse.json({ docs });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { slug: string; title: string; docType?: "strategy" | "playbook" | "policy" | "whitepaper" };
  if (!body.slug || !body.title) return NextResponse.json({ error: "slug and title are required" }, { status: 400 });
  const row = await createLivingDoc(body);
  return NextResponse.json(row, { status: 201 });
}
