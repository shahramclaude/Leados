import { NextResponse } from "next/server";
import { exportDoc, getDoc, getDocVersions, transitionDoc, type DocStatus } from "@/lib/docs";
import { regenerateLivingDoc } from "@/lib/livingDocs";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  if (searchParams.get("export") === "true") {
    try {
      const text = await exportDoc(id);
      return new NextResponse(text, { headers: { "content-type": "text/markdown" } });
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 404 });
    }
  }
  const doc = await getDoc(id);
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const versions = await getDocVersions(id);
  return NextResponse.json({ doc, versions });
}

// POST { action: "regenerate" } — only valid for living docs.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  if (body.action === "regenerate") {
    try {
      const result = await regenerateLivingDoc(id);
      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 400 });
    }
  }
  return NextResponse.json({ error: `unknown action "${String(body.action)}"` }, { status: 400 });
}

// PATCH { status: "review"|"approved"|"superseded", approvedBy? }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json()) as { status?: DocStatus; approvedBy?: string };
  if (!body.status) return NextResponse.json({ error: "status is required" }, { status: 400 });
  try {
    const row = await transitionDoc(id, body.status, body.approvedBy);
    return NextResponse.json(row);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
