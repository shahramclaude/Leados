import { NextResponse } from "next/server";
import { addVersion, approveVersion, getDoc, renderLive, type DocBlock } from "@/lib/livingDocs";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await getDoc(slug);
  if (!result) return NextResponse.json({ error: "not found" }, { status: 404 });
  const live = await renderLive(slug);
  return NextResponse.json({ ...result, liveRenderedContent: live });
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = (await request.json()) as { blocks: DocBlock[]; authorName: string; changeNote?: string };
  if (!body.blocks || !body.authorName) return NextResponse.json({ error: "blocks and authorName are required" }, { status: 400 });
  try {
    const version = await addVersion({ slug, blocks: body.blocks, authorName: body.authorName, changeNote: body.changeNote });
    return NextResponse.json(version, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = (await request.json()) as { version: number; approvedBy: string };
  if (!body.version || !body.approvedBy) return NextResponse.json({ error: "version and approvedBy are required" }, { status: 400 });
  try {
    const result = await approveVersion(slug, body.version, body.approvedBy);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
