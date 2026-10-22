import { ensureConversation, getConversationHistory, processTurn } from "@/lib/conversation/engine";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const turns = await getConversationHistory(id);
  return Response.json({ turns });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const text: string | undefined = body.text;
  if (!text || !text.trim()) {
    return Response.json({ error: "text is required" }, { status: 400 });
  }

  await ensureConversation(id);
  const result = await processTurn(id, text.trim());
  return Response.json({ turn: result }, { status: 201 });
}
