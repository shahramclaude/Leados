import { approveCaptureProposal } from "@/lib/classify";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: { approvedBy?: string } = {};
  try {
    body = await req.json();
  } catch {
    // no body is fine
  }
  try {
    const result = await approveCaptureProposal(id, body.approvedBy ?? "reviewer@leados.local");
    return Response.json({ ok: true, result });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
