import { dismissFinding } from "@/lib/server/engine";

export const dynamic = "force-dynamic";

export async function PATCH(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  await dismissFinding(id);
  return Response.json({ ok: true });
}
