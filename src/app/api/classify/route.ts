import { classifyCapture, listCaptureProposals } from "@/lib/classify";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") as "pending" | "approved" | "rejected" | null;
  const proposals = await listCaptureProposals(status ?? undefined);
  return Response.json({ ok: true, proposals });
}

export async function POST(req: Request) {
  let body: { sourceType?: "note" | "email"; text?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const text = (body.text ?? "").trim();
  if (!text) return Response.json({ ok: false, error: "`text` is required" }, { status: 400 });

  try {
    const result = await classifyCapture(body.sourceType ?? "note", text);
    return Response.json({ ok: true, result });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
