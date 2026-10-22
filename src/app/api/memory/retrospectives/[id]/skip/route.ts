import { skipRetrospective } from "@/lib/memory";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const row = await skipRetrospective(id);
  if (!row) return Response.json({ ok: false, error: "Not found" }, { status: 404 });
  return Response.json({ ok: true, retrospective: row });
}
