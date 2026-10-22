import { reactivateMemory } from "@/lib/institutionalMemory";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const memory = await reactivateMemory(id);
    if (!memory) return Response.json({ ok: false, error: "Memory not found" }, { status: 404 });
    return Response.json({ ok: true, memory });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
