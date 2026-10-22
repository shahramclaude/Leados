import { ensureConversation, listConversations } from "@/lib/conversation/engine";

export const dynamic = "force-dynamic";

export async function GET() {
  const conversations = await listConversations();
  return Response.json({ conversations });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const conversation = await ensureConversation(undefined, body.title);
  return Response.json({ conversation }, { status: 201 });
}
