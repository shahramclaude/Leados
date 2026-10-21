import "@/lib/kernel/bootstrap";
import { listDeadLetters, resolveDeadLetter } from "@/lib/kernel/deadLetter";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ deadLetters: await listDeadLetters() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { id?: string };
  if (!body.id) return Response.json({ error: "id is required" }, { status: 400 });
  const row = await resolveDeadLetter(body.id);
  return Response.json({ deadLetter: row });
}
