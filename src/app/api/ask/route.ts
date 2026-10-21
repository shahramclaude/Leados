import { askLeados } from "@/lib/conversationIntelligence";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { question?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const question = (body.question ?? "").trim();
  if (!question) {
    return Response.json({ ok: false, error: "`question` is required" }, { status: 400 });
  }
  try {
    const answer = await askLeados(question, { kind: "user", id: "web-ui" });
    return Response.json({ ok: true, answer });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
