import { detectCycles } from "@/lib/knowledgeGraph";

export const dynamic = "force-dynamic";

export async function GET() {
  const cycles = await detectCycles();
  return Response.json({ ok: true, count: cycles.length, cycles });
}
