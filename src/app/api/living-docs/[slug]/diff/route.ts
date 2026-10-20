import { NextResponse } from "next/server";
import { diffVersions } from "@/lib/livingDocs";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  const a = Number(searchParams.get("a"));
  const b = Number(searchParams.get("b"));
  if (!a || !b) return NextResponse.json({ error: "a and b version numbers are required" }, { status: 400 });
  try {
    const diff = await diffVersions(slug, a, b);
    return NextResponse.json({ diff });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
